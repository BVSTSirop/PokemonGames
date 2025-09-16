from flask import Blueprint, render_template

bp = Blueprint('type_matchup', __name__)

@bp.route('/type-matchup')
def type_matchup():
    return render_template('type_matchup.html', title='Type Matchup (Coming Soon)', active_page='type')
